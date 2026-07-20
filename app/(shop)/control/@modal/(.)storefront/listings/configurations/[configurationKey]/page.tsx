import ConfigurationPage from "@/app/(shop)/control/storefront/listings/configurations/[configurationKey]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function ConfigurationModal(props: Parameters<typeof ConfigurationPage>[0]) {
  return (
    <ControlModalRoute>
      <ConfigurationPage {...props} />
    </ControlModalRoute>
  );
}
