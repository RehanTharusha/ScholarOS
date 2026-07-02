import { app } from "electron";

export function getRendererUrl(search = ""): string {
  if (app.isPackaged) {
    return `app://-/index.html${search}`;
  }

  return `http://localhost:5173${search}`;
}
