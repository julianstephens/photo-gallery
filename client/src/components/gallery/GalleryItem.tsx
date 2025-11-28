import { BlurredImage } from "@/components/BlurredImage";
import { Tooltip } from "@/components/ui/tooltip";
import { AspectRatio, Link } from "@chakra-ui/react";
import type { GalleryItem as GI } from "utils";

export interface GalleryItemProps {
  item: GI;
  guildId: string;
  galleryName: string;
}

export const GalleryItem = ({ item, guildId, galleryName }: GalleryItemProps) => {
  const name = item.metadata?.name ?? item.name;
  const urlParts = item.url.split("/");
  const uploadsIndex = urlParts.indexOf("uploads");
  const normalizedGalleryName = uploadsIndex > 0 ? urlParts[uploadsIndex - 1] : galleryName;
  const imagePath = uploadsIndex !== -1 ? urlParts.slice(uploadsIndex + 1).join("/") : item.url;
  const imageSrc = `/media/${normalizedGalleryName}/${imagePath}?guildId=${guildId}`;

  return (
    <Tooltip content={name}>
      <Link
        display="inline-block"
        w="full"
        href={imageSrc}
        target="_blank"
        rel="noopener noreferrer"
      >
        <AspectRatio ratio={1} w="full" mb="2">
          <BlurredImage src={imageSrc} alt={name} gradient={item.gradient} borderRadius="xl" />
        </AspectRatio>
      </Link>
    </Tooltip>
  );
};
