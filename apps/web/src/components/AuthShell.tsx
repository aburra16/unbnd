import { Link } from "react-router-dom";
import { Icon } from "@unbnd/ui";
import "./AuthShell.css";

type Props = {
  title: string;
  subtitle?: React.ReactNode;
  logoFill?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthShell({
  title,
  subtitle,
  logoFill,
  children,
  footer,
}: Props) {
  return (
    <div className="auth-page">
      <header className="auth-topbar">
        <Link to="/" className="auth-back">
          ← Back to Unbnd
        </Link>
      </header>
      <div className="auth-card">
        <div className="auth-card-mark">
          <Icon name="logo" size={40} fill={logoFill} opacityScheme="soft" />
        </div>
        <h1 className="auth-card-title">{title}</h1>
        {subtitle && <p className="auth-card-sub">{subtitle}</p>}
        <div className="auth-card-body">{children}</div>
        {footer && <div className="auth-card-footer">{footer}</div>}
      </div>
    </div>
  );
}
