import { redirect } from "next/navigation";
import Studio from "@/components/Studio";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { cookies } from "next/headers";

export default async function Home() {
  const store = await cookies();
  const authed = await verifySessionToken(store.get(COOKIE_NAME)?.value);
  if (!authed) redirect("/login");
  return <Studio />;
}
