import { Tooltip } from "@/components/ui/tooltip";
import { Flex, Image, Link } from "@chakra-ui/react";
import { useState } from "react";
import type { GalleryItem as GI } from "utils";

export interface GalleryItemProps {
  item: GI;
  imageSize: number;
}

export const GalleryItem = ({ item, imageSize }: GalleryItemProps) => {
  const [name] = useState(item.metadata?.name ?? item.name);

  return (
    <Flex>
      <Tooltip content={name}>
        <Link href={item.url} target="_blank" rel="noopener noreferrer">
          <Image w={imageSize} src={item.url} alt={name} loading="lazy" />
        </Link>
      </Tooltip>
    </Flex>
  );
};
