import { Tooltip } from "@/components/ui/tooltip";
import { AspectRatio, Box, Image, Link } from "@chakra-ui/react";
import type { GalleryItem as GI } from "utils";

export interface GalleryItemProps {
  item: GI;
  guildId: string;
  galleryName: string;
}

export const GalleryItem = ({ item, guildId, galleryName }: GalleryItemProps) => {
  const name = item.metadata?.name ?? item.name;
  // item.url is the full S3 key: "normalizedGalleryFolderName/uploads/date/filename"
  // Extract everything after uploads/ to construct the media URL
  const urlParts = item.url.split("/");
  const uploadsIndex = urlParts.indexOf("uploads");
  const imagePath = uploadsIndex !== -1 ? urlParts.slice(uploadsIndex + 1).join("/") : item.url;
  const galleryNameForUrl = urlParts[uploadsIndex - 1] || galleryName;
  const imageSrc = `/media/${galleryNameForUrl}/${imagePath}?guildId=${guildId}`;

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
          <Box position="relative" borderRadius="xl" overflow="hidden" bg="gray.800">
            <Image w="100%" h="100%" objectFit="cover" src={imageSrc} alt={name} loading="eager" />
          </Box>
        </AspectRatio>
      </Link>
    </Tooltip>
  );
};
