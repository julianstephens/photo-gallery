import { BlurredImage } from "@/components/BlurredImage";
import { Tooltip } from "@/components/ui/tooltip";
import { AspectRatio, Box, Checkbox, Link } from "@chakra-ui/react";
import type { GalleryItem as GI } from "utils";

export interface GalleryItemProps {
  item: GI;
  guildId: string;
  galleryName: string;
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (itemName: string) => void;
}

export const GalleryItem = ({
  item,
  guildId,
  galleryName,
  selectMode = false,
  isSelected = false,
  onToggleSelect,
}: GalleryItemProps) => {
  const name = item.metadata?.name ?? item.name;
  const urlParts = item.url.split("/");
  const uploadsIndex = urlParts.indexOf("uploads");
  const normalizedGalleryName = uploadsIndex > 0 ? urlParts[uploadsIndex - 1] : galleryName;
  const imagePath = uploadsIndex !== -1 ? urlParts.slice(uploadsIndex + 1).join("/") : item.url;
  const imageSrc = `/api/media/${normalizedGalleryName}/${imagePath}?guildId=${guildId}`;

  const handleClick = (e: React.MouseEvent) => {
    if (selectMode && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(item.name);
    }
  };

  const content = (
    <AspectRatio ratio={1} w="full" mb="2">
      <BlurredImage src={imageSrc} alt={name} gradient={item.gradient} borderRadius="xl" />
    </AspectRatio>
  );

  if (selectMode) {
    return (
      <Box
        position="relative"
        cursor="pointer"
        onClick={handleClick}
        opacity={isSelected ? 1 : 0.8}
        _hover={{ opacity: 1 }}
        transition="opacity 0.2s"
      >
        {content}
        <Box
          position="absolute"
          top="0"
          left="0"
          right="0"
          bottom="0"
          bg={isSelected ? "blackAlpha.400" : "blackAlpha.200"}
          borderRadius="xl"
          mb="2"
          display="flex"
          alignItems="flex-start"
          justifyContent="flex-end"
          p="2"
          _hover={{ bg: "blackAlpha.300" }}
          transition="background 0.2s"
        >
          <Checkbox.Root
            checked={isSelected}
            onCheckedChange={() => onToggleSelect?.(item.name)}
            size="lg"
            colorPalette="blue"
            variant="solid"
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control
              bg={isSelected ? "blue.500" : "white"}
              borderColor={isSelected ? "blue.500" : "gray.400"}
              borderWidth="2px"
              borderRadius="md"
            >
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox.Root>
        </Box>
      </Box>
    );
  }

  return (
    <Tooltip content={name}>
      <Link
        display="inline-block"
        w="full"
        href={imageSrc}
        target="_blank"
        rel="noopener noreferrer"
      >
        {content}
      </Link>
    </Tooltip>
  );
};
