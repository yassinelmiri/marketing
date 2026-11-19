
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SupabaseTestPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function testAuth() {
    setLoading(true);
    setResult("");

    try {
      const supabase = createClient();

      // 1. Connexion
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (authError) {
        setResult("Erreur Auth : " + authError.message);
        return;
      }

      // 2. Verifier le profil
      const { data: profile, error: profileError } =
        await supabase
          .from("user_profiles")
          .select("id, email, role_id")
          .eq("auth_user_id", authData.user.id)
          .single();

      if (profileError) {
        setResult("Connexion réussie, mais profil introuvable : " +
          profileError.message);
        return;
      }

      // 3. Verifier les roles
      const { data: roles, error: rolesError } =
        await supabase
          .from("roles")
          .select("id, nom");

      if (rolesError) {
        setResult("Profil trouvé, erreur rôles : " +
          rolesError.message);
        return;
      }

      setResult(
        "Connexion réussie !\n" +
        "Email : " + profile.email + "\n" +
        "Role ID : " + profile.role_id + "\n" +
        "Roles accessibles : " + roles.length
      );

    } catch (error) {
      setResult(
        error instanceof Error ? error.message : "Erreur inconnue"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 450, margin: "60px auto", padding: 20 }}>
      <h1>Test Supabase Auth</h1>

      <input
        type="email"
        placeholder="Email Admin"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 12, marginBottom: 12 }}
      />

      <input
        type="password"
        placeholder="Mot de passe"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", padding: 12, marginBottom: 12 }}
      />

      <button
        onClick={testAuth}
        disabled={loading || !email || !password}
        style={{ padding: 12, width: "100%" }}
      >
        {loading ? "Test en cours..." : "Tester Auth"}
      </button>

      <pre style={{ whiteSpace: "pre-wrap", marginTop: 20 }}>
        {result}
      </pre>
    </main>
  );
}
