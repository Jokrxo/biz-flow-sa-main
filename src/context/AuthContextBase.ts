import { createContext } from "react";
import type { User } from "@supabase/supabase-js";

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  subscriptionStatus?: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  startDemo?: () => Promise<void>;
  endDemo?: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
export default AuthContext;
