import { redirect } from "next/navigation";

// The dashboard home is the System overview; "/" just forwards there so the
// four nav sections map one-to-one onto the four route folders.
export default function RootPage() {
  redirect("/system");
}
