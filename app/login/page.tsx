import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand-mark">IA</div>
        <h1>Ileoja Academy</h1>
        <p className="sub">Certificate Generator — Admin Portal</p>
        <LoginForm />
      </div>
    </div>
  );
}
