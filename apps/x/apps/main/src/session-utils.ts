import { Session, desktopCapturer } from "electron";

const ALLOWED_SESSION_PERMISSIONS = new Set([
  "media",
  "display-capture",
  "clipboard-read",
  "clipboard-sanitized-write",
]);

export function configureSessionPermissions(targetSession: Session): void {
  targetSession.setPermissionCheckHandler((_webContents, permission) => {
    return ALLOWED_SESSION_PERMISSIONS.has(permission);
  });

  targetSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(ALLOWED_SESSION_PERMISSIONS.has(permission));
    },
  );

  // Auto-approve display media requests and route system audio as loopback.
  // Electron requires a video source in the callback even if we only want audio.
  // We pass the first available screen source; the renderer discards the video track.
  targetSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    if (sources.length === 0) {
      callback({});
      return;
    }
    callback({ video: sources[0], audio: "loopback" });
  });
}
