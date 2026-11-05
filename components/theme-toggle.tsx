"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

const KEY = "pe-tema";

/** Segue o aparelho por padrão; o botão troca e lembra a escolha neste navegador. */
export function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    setDark(t ? t === "dark" : !matchMedia("(prefers-color-scheme: light)").matches);
  }, []);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(KEY, next); } catch { /* sem armazenamento: vale só nesta visita */ }
    setDark(!dark);
  };
  return (
    <button type="button" onClick={toggle} aria-label={dark ? "Mudar para o tema claro" : "Mudar para o tema escuro"} title={dark ? "Tema claro" : "Tema escuro"}>
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

/** Aplica o tema salvo antes da página aparecer (evita piscar). */
export const themeScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
