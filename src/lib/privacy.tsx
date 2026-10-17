import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "mcd:privacy";
const Ctx = createContext<{ hidden: boolean; toggle: () => void }>({ hidden: false, toggle: () => {} });

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(localStorage.getItem(KEY) === "1");
  }, []);
  const toggle = () =>
    setHidden((h) => {
      localStorage.setItem(KEY, h ? "0" : "1");
      return !h;
    });
  return <Ctx.Provider value={{ hidden, toggle }}>{children}</Ctx.Provider>;
}

export const usePrivacy = () => useContext(Ctx);
