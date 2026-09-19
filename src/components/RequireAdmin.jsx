import React from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import db from "@/api/localDatabase";

export default function RequireAdmin({ children }) {
  const { data, isLoading } = useQuery({
    queryKey: ["current-user-role"],
    queryFn: async () => {
      try {
        return await db.auth.me();
      } catch {
        return null;
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (!data) {
    return <Navigate to="/entrar" replace />;
  }

  if (data.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
