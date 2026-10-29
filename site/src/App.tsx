import { useRoute } from "@/lib/route";
import Home from "@/pages/Home";
import Operators from "@/pages/Operators";

export default function App() {
  const route = useRoute();
  return route.startsWith("/operators") ? <Operators /> : <Home />;
}
