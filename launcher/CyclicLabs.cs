// ============================================================================
//  Cyclic Labs launcher  ("Cyclic Labs.exe")
//
//  Double-click it: it serves the app at http://localhost:8765/, opens it in your
//  browser, and runs the CalculiX solver when the app asks. It sits in the system
//  tray (bottom-right, by the clock); right-click the icon > Quit to stop it.
//
//  It is the same job CyclicLabs-Server.ps1 does, without needing PowerShell.
//  It only listens on this computer (localhost): nothing is reachable from the
//  network, nothing is installed, nothing is sent anywhere, no admin rights.
//
//  Build: run build.bat (next to this file). It uses the C# compiler that ships
//  with Windows (.NET Framework 4.x), so nothing has to be downloaded.
//  Plain C# 5 on purpose: that's what that compiler understands.
//
//  Folder layouts it understands (same as the .ps1):
//    shared copy:  <Cyclic Labs>\Cyclic Labs.exe, app\, system\solver\
//    working copy: <Cyclic Labs>\Cyclic Labs.exe, app\, CalculiX somewhere under ..\CGX
//  A full path to any ccx .exe in "ccx_path.txt" (next to the exe) wins.
// ============================================================================
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Cyclic Labs")]
[assembly: AssemblyDescription("Cyclic Labs - titanium bike frame design helper (local launcher)")]
[assembly: AssemblyProduct("Cyclic Labs")]
[assembly: AssemblyCompany("Cyclic Labs open-source project")]
[assembly: AssemblyCopyright("Cyclic Labs contributors - open source")]
[assembly: AssemblyVersion("9.2.0.0")]
[assembly: AssemblyFileVersion("9.2.0.0")]

namespace CyclicLabs
{
    static class Launcher
    {
        const int Port = 8765;
        static readonly string Url = "http://localhost:" + Port + "/";

        static string exeDir, appDir, jobsDir, ccx;
        static HttpListener listener;
        static NotifyIcon tray;
        static readonly object ccxLock = new object();

        static readonly Dictionary<string, string> Types = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
            { ".html", "text/html; charset=utf-8" }, { ".js", "text/javascript; charset=utf-8" }, { ".css", "text/css" },
            { ".json", "application/json" }, { ".png", "image/png" }, { ".jpg", "image/jpeg" }, { ".svg", "image/svg+xml" },
            { ".wasm", "application/wasm" }, { ".txt", "text/plain; charset=utf-8" }, { ".dat", "text/plain; charset=utf-8" },
            { ".frd", "text/plain; charset=utf-8" }, { ".inp", "text/plain; charset=utf-8" } };

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            exeDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            appDir = Path.Combine(exeDir, "app");

            if (!File.Exists(Path.Combine(appDir, "index.html")))
            {
                Msg("Cyclic Labs can't find its files (the \"app\" folder next to Cyclic Labs.exe).\n\n" +
                    "This usually means it's being run from inside the zip file. Close this, right-click the zip, " +
                    "choose \"Extract All...\", then open the extracted Cyclic Labs folder and double-click Cyclic Labs.exe there.\n\n" +
                    "Keep Cyclic Labs.exe together with its app and system folders.", MessageBoxIcon.Warning);
                return;
            }

            // Already running (double-clicked twice)? Just open the browser on it. Saved designs live in the
            // browser per address, so it's important to always use the same one: http://localhost:8765/
            if (AlreadyRunning()) { OpenBrowser(); return; }

            listener = new HttpListener();
            listener.Prefixes.Add(Url);
            try { listener.Start(); }
            catch (Exception ex)
            {
                Msg("Cyclic Labs could not start on port " + Port + ":\n" + ex.Message + "\n\n" +
                    "Another program is using that port. Close it (or restart the computer) and try again.", MessageBoxIcon.Warning);
                return;
            }

            jobsDir = PickJobsDir();
            UnblockSolver();
            ccx = FindCcx();

            var t = new Thread(ServeLoop); t.IsBackground = true; t.Start();
            SetupTray();
            OpenBrowser();
            Application.Run();
        }

        // ---------------------------------------------------------------- tray icon
        static void SetupTray()
        {
            tray = new NotifyIcon();
            try { tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { tray.Icon = SystemIcons.Application; }
            tray.Text = "Cyclic Labs - running at localhost:" + Port;
            var menu = new ContextMenuStrip();
            var open = new ToolStripMenuItem("Open Cyclic Labs", null, delegate { OpenBrowser(); });
            open.Font = new Font(open.Font, FontStyle.Bold);
            menu.Items.Add(open);
            var solver = new ToolStripMenuItem(ccx != null ? "CalculiX: " + Path.GetFileName(ccx) : "CalculiX: not found (see READ ME FIRST)");
            solver.Enabled = false;
            menu.Items.Add(solver);
            menu.Items.Add(new ToolStripMenuItem("Open the Cyclic Labs folder", null, delegate { Shell(exeDir); }));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("Quit Cyclic Labs", null, delegate { Quit(); }));
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { OpenBrowser(); };
            tray.Visible = true;
            tray.ShowBalloonTip(6000, "Cyclic Labs is running",
                ccx != null ? "It's open in your browser. To stop it: right-click this icon > Quit."
                            : "It's open in your browser. CalculiX wasn't found, so the CalculiX check is off. Right-click this icon > Quit to stop.",
                ToolTipIcon.Info);
        }

        static void Quit()
        {
            try { tray.Visible = false; tray.Dispose(); } catch { }
            try { listener.Stop(); } catch { }
            Application.Exit();
        }

        static void OpenBrowser() { Shell(Url); }
        static void Shell(string target) { try { Process.Start(target); } catch { } }
        static void Msg(string text, MessageBoxIcon icon) { MessageBox.Show(text, "Cyclic Labs", MessageBoxButtons.OK, icon); }

        static bool AlreadyRunning()
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(Url + "ccx/status");
                req.Timeout = 2000; req.Proxy = null;
                using (var res = (HttpWebResponse)req.GetResponse()) return res.StatusCode == HttpStatusCode.OK;
            }
            catch { return false; }
        }

        // ---------------------------------------------------------------- folders + solver
        static string PickJobsDir()
        {
            string sys = Path.Combine(exeDir, "system");
            var options = new List<string>();
            options.Add(Path.Combine(Directory.Exists(sys) ? sys : exeDir, "ccx_jobs"));
            // read-only folder (e.g. Program Files)? use the user's local app data instead
            options.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cyclic Labs", "ccx_jobs"));
            foreach (var d in options)
            {
                try
                {
                    Directory.CreateDirectory(d);
                    string probe = Path.Combine(d, ".write_test");
                    File.WriteAllText(probe, "ok"); File.Delete(probe);
                    return d;
                }
                catch { }
            }
            return options[options.Count - 1];
        }

        static string[] SolverDirs()
        {
            string parent = Path.GetDirectoryName(exeDir) ?? exeDir;
            return new string[] {
                Path.Combine(exeDir, @"system\solver\my-calculix"), Path.Combine(exeDir, @"system\solver"),
                Path.Combine(exeDir, @"solver\my-calculix"), Path.Combine(exeDir, "solver"),
                Path.Combine(parent, "CGX") };
        }

        static string FindCcx()
        {
            foreach (var cfgDir in new string[] { exeDir, Path.Combine(exeDir, "system") })
            {
                try
                {
                    string cfg = Path.Combine(cfgDir, "ccx_path.txt");
                    if (File.Exists(cfg))
                    {
                        string p = File.ReadAllText(cfg).Trim().Trim('"');
                        if (p.Length > 0 && File.Exists(p)) return p;
                    }
                }
                catch { }
            }
            string[] preferred = { "ccx_2.23.exe", "ccx_2.22.exe", "ccx.exe", "ccx_static.exe", "ccx_dynamic.exe", "ccx213.exe", "ccx212.exe" };
            foreach (var dir in SolverDirs())
            {
                if (!Directory.Exists(dir)) continue;
                foreach (var name in preferred) { string hit = FirstFile(dir, name); if (hit != null) return hit; }
                string any = FirstFile(dir, "ccx*.exe"); if (any != null) return any;
            }
            return null;
        }

        // recursive search that skips folders it isn't allowed to read
        static string FirstFile(string dir, string pattern)
        {
            var stack = new Stack<string>(); stack.Push(dir);
            while (stack.Count > 0)
            {
                string d = stack.Pop();
                try { var f = Directory.GetFiles(d, pattern); if (f.Length > 0) { Array.Sort(f); return f[0]; } } catch { }
                try { var subs = Directory.GetDirectories(d); Array.Sort(subs); for (int i = subs.Length - 1; i >= 0; i--) stack.Push(subs[i]); } catch { }
            }
            return null;
        }

        // Files downloaded from the internet are marked "blocked" by Windows, which can stop the solver from starting.
        // Clear that mark on the solver's own files only (ccx + its DLLs) - nothing else on the computer is touched.
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool DeleteFile(string path);
        static void UnblockSolver()
        {
            foreach (var dir in SolverDirs())
            {
                if (!Directory.Exists(dir) || dir.EndsWith("CGX")) continue;
                try
                {
                    foreach (var f in Directory.GetFiles(dir))
                    {
                        string ext = Path.GetExtension(f).ToLowerInvariant();
                        if (ext == ".exe" || ext == ".dll") DeleteFile(f + ":Zone.Identifier");
                    }
                }
                catch { }
            }
        }

        // ---------------------------------------------------------------- HTTP
        static void ServeLoop()
        {
            while (listener.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = listener.GetContext(); } catch { break; }
                ThreadPool.QueueUserWorkItem(delegate { Handle(ctx); });
            }
        }

        static void Handle(HttpListenerContext ctx)
        {
            var req = ctx.Request; var res = ctx.Response;
            try
            {
                string path = Uri.UnescapeDataString(req.Url.AbsolutePath);
                if (path == "/ccx/status")
                {
                    SendText(res, 200, "application/json", "{\"found\":" + (ccx != null ? "true" : "false") + ",\"path\":\"" + Esc(ccx) + "\"}");
                }
                else if (path == "/ccx/run" && req.HttpMethod == "POST")
                {
                    string inp;
                    using (var r = new StreamReader(req.InputStream, new UTF8Encoding(false))) inp = r.ReadToEnd();
                    SendText(res, 200, "application/json", RunCcx(inp));
                }
                else if (path.StartsWith("/ccx/out/"))
                {
                    string name = path.Substring("/ccx/out/".Length);
                    string file = Path.Combine(jobsDir, name);
                    if (Regex.IsMatch(name, @"^job\.(dat|frd|log|inp|sta)$") && File.Exists(file))
                        Send(res, 200, "text/plain; charset=utf-8", File.ReadAllBytes(file));
                    else SendText(res, 404, "text/plain", "not found");
                }
                else
                {
                    if (path == "/") path = "/index.html";
                    string full = Path.GetFullPath(Path.Combine(appDir, path.TrimStart('/').Replace('/', '\\')));
                    string root = Path.GetFullPath(appDir).TrimEnd('\\') + "\\";
                    if (full.StartsWith(root, StringComparison.OrdinalIgnoreCase) && File.Exists(full))
                    {
                        string type;
                        if (!Types.TryGetValue(Path.GetExtension(full), out type)) type = "application/octet-stream";
                        Send(res, 200, type, File.ReadAllBytes(full));
                    }
                    else SendText(res, 404, "text/plain", "not found");
                }
            }
            catch (Exception ex)
            {
                try { SendText(res, 500, "text/plain", ex.Message); } catch { }
            }
        }

        static string RunCcx(string inp)
        {
            if (ccx == null) return "{\"ok\":false,\"error\":\"CalculiX solver not found\"}";
            lock (ccxLock)   // one solve at a time; they share the job folder
            {
                foreach (var f in Directory.GetFiles(jobsDir, "job.*")) { try { File.Delete(f); } catch { } }
                File.WriteAllText(Path.Combine(jobsDir, "job.inp"), inp, new UTF8Encoding(false));

                var psi = new ProcessStartInfo(ccx, "job");
                psi.WorkingDirectory = jobsDir;
                psi.UseShellExecute = false; psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true; psi.RedirectStandardError = true;
                psi.EnvironmentVariables["OMP_NUM_THREADS"] = Environment.ProcessorCount.ToString(CultureInfo.InvariantCulture);
                var outSb = new StringBuilder(); var errSb = new StringBuilder();
                var sw = Stopwatch.StartNew();
                int exitCode;
                using (var p = new Process())
                {
                    p.StartInfo = psi;
                    p.OutputDataReceived += delegate (object s, DataReceivedEventArgs e) { if (e.Data != null) lock (outSb) outSb.AppendLine(e.Data); };
                    p.ErrorDataReceived += delegate (object s, DataReceivedEventArgs e) { if (e.Data != null) lock (errSb) errSb.AppendLine(e.Data); };
                    try { p.Start(); }
                    catch (Exception ex) { return "{\"ok\":false,\"error\":\"Could not start CalculiX: " + Esc(ex.Message) + "\"}"; }
                    p.BeginOutputReadLine(); p.BeginErrorReadLine();
                    p.WaitForExit();
                    exitCode = p.ExitCode;
                }
                sw.Stop();
                string log; lock (outSb) log = outSb.ToString();
                try { File.WriteAllText(Path.Combine(jobsDir, "job.log"), log); } catch { }
                try { lock (errSb) File.WriteAllText(Path.Combine(jobsDir, "job.err"), errSb.ToString()); } catch { }

                bool ok = File.Exists(Path.Combine(jobsDir, "job.frd")) && File.Exists(Path.Combine(jobsDir, "job.dat"))
                          && log.IndexOf("*ERROR", StringComparison.Ordinal) < 0;
                string tail = log.Length > 4000 ? log.Substring(log.Length - 4000) : log;
                return "{\"ok\":" + (ok ? "true" : "false") + ",\"exitCode\":" + exitCode.ToString(CultureInfo.InvariantCulture) +
                       ",\"seconds\":" + Math.Round(sw.Elapsed.TotalSeconds, 2).ToString(CultureInfo.InvariantCulture) +
                       ",\"log\":\"" + Esc(tail) + "\"}";
            }
        }

        static void Send(HttpListenerResponse res, int code, string type, byte[] bytes)
        {
            res.StatusCode = code; res.ContentType = type;
            res.Headers.Add("Cache-Control", "no-store");
            res.ContentLength64 = bytes.Length;
            res.OutputStream.Write(bytes, 0, bytes.Length);
            res.OutputStream.Close();
        }
        static void SendText(HttpListenerResponse res, int code, string type, string text) { Send(res, code, type, new UTF8Encoding(false).GetBytes(text)); }

        static string Esc(string s)
        {
            if (s == null) return "";
            var sb = new StringBuilder(s.Length + 16);
            foreach (char c in s)
            {
                switch (c)
                {
                    case '\\': sb.Append("\\\\"); break;
                    case '"': sb.Append("\\\""); break;
                    case '\r': break;
                    case '\n': sb.Append("\\n"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }
    }
}
