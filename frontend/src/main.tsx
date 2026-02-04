import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Entry point for the React application. It hydrates the root DOM element
// with the App component. StrictMode helps detect potential problems.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
