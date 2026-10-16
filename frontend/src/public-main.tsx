import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProviders } from "./app/providers.js";
import { WorkbenchPage } from "./features/judge/pages/workbench-page.js";
import { RuntimePage } from "./features/judge/pages/runtime-page.js";
import { ValidationPage } from "./features/judge/pages/validation-page.js";
import "./styles/globals.css";
import { ProductProvider } from "./features/judge/pages/product-state.js";

const root = document.getElementById("root");
if (!root) throw new Error("frontend_root_not_found");

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <BrowserRouter basename={import.meta.env.BASE_URL}><ProductProvider>
        <Routes>
          <Route path="/" element={<WorkbenchPage />} />
          <Route path="/runtime" element={<RuntimePage />} />
          <Route path="/validation" element={<ValidationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ProductProvider></BrowserRouter>
    </AppProviders>
  </StrictMode>,
);
