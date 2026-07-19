import { useParams, useNavigate } from "react-router-dom";
import { StoringDetailBody } from "@/components/admin/storing/StoringDetailBody";

// Route-wrapper voor directe URLs (/beheer/storingen/:id). De inhoud leeft in
// StoringDetailBody, die ook door StoringDetailSheet (slide-over) wordt hergebruikt.
export default function AdminStoringDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <StoringDetailBody faultId={id!} onClose={() => navigate("/beheer/storingen")} />;
}
