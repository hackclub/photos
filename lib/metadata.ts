import type { Metadata } from "next";
import { APP_URL } from "@/lib/constants";

export function absoluteAppUrl(path: string) {
  return new URL(path, APP_URL).toString();
}

export function createOgMetadata({
  title,
  description,
  path,
  imagePath,
  imageAlt,
  type = "website",
  imageWidth = 1200,
  imageHeight = 630,
}: {
  title: string;
  description: string;
  path: string;
  imagePath: string;
  imageAlt?: string;
  type?: "website" | "article" | "profile";
  imageWidth?: number;
  imageHeight?: number;
}): Metadata {
  const url = absoluteAppUrl(path);
  const imageUrl = absoluteAppUrl(imagePath);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type,
      url,
      images: [
        {
          url: imageUrl,
          width: imageWidth,
          height: imageHeight,
          alt: imageAlt ?? title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}
