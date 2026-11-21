import { createContext } from "react";
import type { CryptoContextValue } from "./cryptoTypes";

export const CryptoContext = createContext<CryptoContextValue | null>(null);