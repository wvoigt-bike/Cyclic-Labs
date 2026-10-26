// ============================================================================
//  HEAD-TUBE BADGES / ENGRAVINGS for the realistic view (display only).
//  Each entry: an image as a data: URL (white artwork on a transparent
//  background; only its alpha is used) and its width / height ratio.
//  A design picks one with parts.headBadge = "<key>" ("" = the head-tube logo text, if any).
//  Kept as data: URLs so the picture works when the app is opened from a
//  file on your PC. To add your own: send Claude the picture.
// ============================================================================
(function (root) {
  "use strict";
  const BADGES = {
  };
  // start decoding straight away; bike3d.js redraws once a picture has loaded
  if (typeof Image !== "undefined") for (const k in BADGES) { const im = new Image(); im.src = BADGES[k].src; BADGES[k].img = im; }
  root.FRAME_BADGES = BADGES;
})(typeof window !== "undefined" ? window : globalThis);
