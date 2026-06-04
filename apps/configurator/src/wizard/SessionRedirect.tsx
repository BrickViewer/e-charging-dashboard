import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";

export default function SessionRedirect() {
  const { sessionId } = useParams({ from: "/s/$sessionId" });
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/s/$sessionId/stap/$step", params: { sessionId, step: "1" } as never, replace: true });
  }, [navigate, sessionId]);

  return null;
}
