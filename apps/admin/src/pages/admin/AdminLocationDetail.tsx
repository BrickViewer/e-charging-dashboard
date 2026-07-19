import { useParams, useNavigate } from "react-router-dom";
import { LocationDetailBody } from "@/components/admin/location/LocationDetailBody";

// Route-wrapper: dezelfde body draait ook als slide-over (LocationDetailSheet).
export default function AdminLocationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return <LocationDetailBody locationId={id!} onClose={() => navigate("/beheer/locaties")} />;
}
