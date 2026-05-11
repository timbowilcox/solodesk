"use client";

import { AtriumModalProvider } from "./ModalQueue";

export function AtriumProviderWrapper({ children }: { children: React.ReactNode }) {
  return <AtriumModalProvider>{children}</AtriumModalProvider>;
}
