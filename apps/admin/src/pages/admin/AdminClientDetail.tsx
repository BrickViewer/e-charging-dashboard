import { useParams, useNavigate } from "react-router-dom";
import { ClientDetailBody } from "@/components/admin/client/ClientDetailBody";

// Route-wrapper: houdt de externe deeplinks (/beheer/klanten/:id) werkend. De volledige inhoud
// zit in ClientDetailBody, die ook door de slide-over (ClientDetailSheet) wordt hergebruikt.
export default function AdminClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return <ClientDetailBody clientId={id!} onClose={() => navigate("/beheer/klanten")} />;
}
