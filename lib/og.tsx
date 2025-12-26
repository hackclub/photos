import { ImageResponse } from "next/og";
export type OgImageProps = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  image?: string;
  label?: string;
};
export function generateOgImage(props: OgImageProps) {
  const { title, description, icon, image, label } = props;
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#09090b",
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {image ? (
        <img
          src={image}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.5,
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background:
              "linear-gradient(to bottom right, #18181b 0%, #09090b 100%)",
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: image
            ? "linear-gradient(to bottom, rgba(9,9,11,0.2) 0%, rgba(9,9,11,0.9) 100%)"
            : "linear-gradient(180deg, rgba(220, 38, 38, 0.15) 0%, transparent 100%)",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 80px",
          textAlign: "center",
          position: "relative",
          zIndex: 10,
        }}
      >
        {icon ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100px",
              height: "100px",
              borderRadius: "24px",
              background: "rgba(220, 38, 38, 0.2)",
              border: "1px solid rgba(220, 38, 38, 0.3)",
              marginBottom: "32px",
              color: "#f87171",
            }}
          >
            {icon}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "32px",
            }}
          >
            <svg
              width="100"
              height="100"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="Hack Club Logo"
            >
              <title>Hack Club Logo</title>
              <path
                d="M10 10H90V60L50 80L10 60V10Z"
                fill="#ec3750"
                stroke="none"
              />
            </svg>
          </div>
        )}

        {label && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px 24px",
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: "100px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              marginBottom: "24px",
            }}
          >
            <span
              style={{
                color: "#e4e4e7",
                fontSize: "20px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {label}
            </span>
          </div>
        )}

        <h1
          style={{
            fontSize: "80px",
            fontWeight: 800,
            color: "white",
            margin: "0 0 24px 0",
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
          }}
        >
          {title}
        </h1>

        {description && (
          <p
            style={{
              fontSize: "36px",
              color: "#d4d4d8",
              margin: 0,
              lineHeight: 1.5,
              maxWidth: "1000px",
            }}
          >
            {description}
          </p>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "40px",
          left: "80px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <span
          style={{
            color: "#71717a",
            fontSize: "24px",
            fontWeight: 500,
          }}
        >
          photos.hackclub.com
        </span>
      </div>

      <img
        src="https://assets.hackclub.com/icon-rounded.png"
        alt="Hack Club"
        style={{
          position: "absolute",
          bottom: "40px",
          right: "80px",
          width: "80px",
          height: "80px",
          borderRadius: "16px",
        }}
      />
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
