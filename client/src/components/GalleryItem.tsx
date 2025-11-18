import { Tooltip } from "@/components/ui/tooltip";
import { Flex, Image, Link } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { GalleryItem as GI } from "utils";

export interface GalleryItemProps {
  item: GI;
  imageSize: number;
}

type NodeBufferLike = { type: "Buffer"; data: number[] };

const isNodeBufferLike = (v: unknown): v is NodeBufferLike => {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj["type"] === "Buffer" && Array.isArray(obj["data"]);
};

const hasArrayBufferBuffer = (v: unknown): v is { buffer: ArrayBuffer } => {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj["buffer"] instanceof ArrayBuffer;
};

export const GalleryItem = ({ item, imageSize }: GalleryItemProps) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [name] = useState(item.metadata?.name ?? item.name);

  useEffect(() => {
    if (!item.content?.data) {
      setImgSrc(null);
      return;
    }
    const raw: unknown = item.content.data as unknown;
    let bytes: Uint8Array | null = null;
    if (isNodeBufferLike(raw)) {
      bytes = new Uint8Array(raw.data);
    } else if (raw instanceof ArrayBuffer) {
      bytes = new Uint8Array(raw);
    } else if (raw instanceof Uint8Array) {
      bytes = raw;
    } else if (Array.isArray(raw)) {
      bytes = new Uint8Array(raw);
    } else if (hasArrayBufferBuffer(raw)) {
      bytes = new Uint8Array(raw.buffer);
    }

    if (bytes) {
      const view = new Uint8Array(bytes.byteLength);
      view.set(bytes);
      const blob = new Blob([view], {
        type: item.content?.contentType ?? "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      setImgSrc(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setImgSrc(null);
    }
  }, [item.content]);

  return (
    <Flex>
      <Tooltip content={name}>
        <Link href={item.url}>
          <Image w={imageSize} src={imgSrc ?? undefined} alt={name} />
        </Link>
      </Tooltip>
    </Flex>
  );
};
