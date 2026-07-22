import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../shared/styles/tokens.css";
import "./customer.css";
import { CustomerApp } from "./CustomerApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CustomerApp />
  </StrictMode>,
);
