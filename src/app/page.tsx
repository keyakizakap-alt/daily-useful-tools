import { redirect } from "next/navigation";

export default function Home() {
  // middleware が未ログインなら /login へ振り分ける
  redirect("/dashboard");
}
