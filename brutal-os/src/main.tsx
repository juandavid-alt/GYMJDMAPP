import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Acceso from "./pages/acceso/Acceso";
import { detectarNube } from "./data/nube";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

// Con backend (Vercel) se exige sesión y la base vive en el servidor; sin backend, modo demostración.
detectarNube().then((n) => {
  root.render(<React.StrictMode>{n.nube ? <Acceso inicial={n.sesion} /> : <App />}</React.StrictMode>);
});
