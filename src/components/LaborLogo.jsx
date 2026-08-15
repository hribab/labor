import { LABOR_LOGO_PATH } from "../lib/laborBrand";

export default function LaborLogo({
  className = "",
  alt = "Labor",
  decorative = false,
}) {
  return (
    <img
      src={LABOR_LOGO_PATH}
      alt={decorative ? "" : alt}
      aria-hidden={decorative ? "true" : undefined}
      draggable="false"
      className={className}
    />
  );
}
