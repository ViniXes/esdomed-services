"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  EmailAuthProvider,
  User,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc } from "@/lib/firestoreMeter";
import { auth, db } from "@/lib/firebase";
import { UserProfile } from "@/types";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const snap = await getDoc(doc(db, "usuarios", firebaseUser.uid));
        setProfile(snap.exists() ? { uid: firebaseUser.uid, ...snap.data() } as UserProfile : null);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Cierre de sesión por inactividad (2 horas). La última actividad se comparte
  // entre pestañas vía localStorage: si otra pestaña sigue activa, una pestaña en
  // segundo plano no cierra la sesión. Al expirar, deja una marca para que /login
  // muestre el aviso y luego hace signOut.
  useEffect(() => {
    if (!user) return;

    const LIMITE_MS = 2 * 60 * 60 * 1000; // 2 horas
    const KEY_ACTIVIDAD = "esdomed:last_activity";
    let timeoutId: number;
    let ultimaEscritura = 0;

    const ahora = () => Date.now();
    const leerUltima = () => {
      const v = Number(localStorage.getItem(KEY_ACTIVIDAD));
      return Number.isFinite(v) && v > 0 ? v : ahora();
    };

    const cerrarPorInactividad = async () => {
      try { sessionStorage.setItem("esdomed:session_expired", "inactividad"); } catch { /* noop */ }
      await signOut(auth);
    };

    const programar = () => {
      window.clearTimeout(timeoutId);
      const restante = LIMITE_MS - (ahora() - leerUltima());
      if (restante <= 0) { void cerrarPorInactividad(); return; }
      timeoutId = window.setTimeout(() => {
        // Revalidar contra la última actividad (pudo actualizarse en otra pestaña).
        if (ahora() - leerUltima() >= LIMITE_MS) void cerrarPorInactividad();
        else programar();
      }, restante);
    };

    const registrarActividad = () => {
      const t = ahora();
      if (t - ultimaEscritura < 30_000) return; // throttle: a lo sumo 1 escritura/30 s
      ultimaEscritura = t;
      try { localStorage.setItem(KEY_ACTIVIDAD, String(t)); } catch { /* noop */ }
      programar();
    };

    const eventos: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    eventos.forEach(e => window.addEventListener(e, registrarActividad, { passive: true }));

    // Inicializar marca y temporizador.
    ultimaEscritura = ahora();
    try { localStorage.setItem(KEY_ACTIVIDAD, String(ultimaEscritura)); } catch { /* noop */ }
    programar();

    return () => {
      window.clearTimeout(timeoutId);
      eventos.forEach(e => window.removeEventListener(e, registrarActividad));
    };
  }, [user]);

  // Acepta correo (lleva "@") o username. Si es username, lo traduce a correo en el
  // servidor antes de autenticar. Cualquier fallo se reporta como credenciales
  // incorrectas para no filtrar qué usuarios existen.
  const login = async (identifier: string, password: string) => {
    const id = identifier.trim();
    let email = id;
    if (id && !id.includes("@")) {
      const res = await fetch("/api/auth/resolve-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: id }),
      });
      if (!res.ok) throw new Error("Credenciales incorrectas");
      email = (await res.json()).email;
    }
    await signInWithEmailAndPassword(auth, email, password);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!user?.email) throw new Error("No se pudo validar tu sesion.");
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, changePassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
