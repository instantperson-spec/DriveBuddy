const VIDEO_EXT = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".mkv",
  ".avi",
  ".wmv",
  ".mpg",
  ".mpeg",
  ".mxf",
  ".r3d",
  ".braw",
  ".crm",
  ".lrv",
  ".insv",
  ".360",
  ".mod",
  ".tod",
  ".m2ts",
  ".mts",
  ".vob",
  ".webm",
  ".3gp",
  ".flv",
  ".f4v",
  ".ogv",
  ".asf",
  ".dv",
  ".m2v",
]);

export function isVideoFile(fileName: string): boolean {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return false;
  return VIDEO_EXT.has(fileName.slice(dot).toLowerCase());
}
