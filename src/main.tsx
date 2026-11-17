import React from "react";
import {createRoot} from "react-dom/client";
import {Capacitor} from "@capacitor/core";
import {App as AndroidApp} from "@capacitor/app";
import App from "./App.jsx";

createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);

if (Capacitor.getPlatform() === "android") {
  AndroidApp.addListener("backButton", () => {
    const volver = new Event("elpibe:volver", {cancelable: true});
    if (window.dispatchEvent(volver)) AndroidApp.minimizeApp();
  });
} else if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
