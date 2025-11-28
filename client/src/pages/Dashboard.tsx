import { SetDefaultGuildButton } from "@/components/buttons/SetDefaultGuildButton";
import { GallerySelect, GuildSelect } from "@/components/forms/Fields";
import { Gallery } from "@/components/gallery/Gallery";
import { Loader } from "@/components/Loader";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuth, useListGalleries } from "@/hooks";
import { useGalleryContext } from "@/hooks";
import { Box, Button, Flex, Heading, IconButton, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { HiArrowUp } from "react-icons/hi";
import { useNavigate } from "react-router";

const Dashboard = () => {
  const [guild, setGuild] = useState<string>("");
  const [gallery, setGallery] = useState<string>("");
  const { currentUser, authReady, logout } = useAuth();
  const goto = useNavigate();
  const {
    data: galleries,
    isLoading: galleriesLoading,
    error: galleriesError,
  } = useListGalleries(guild);
  const { setActiveGuild, setActiveGallery, defaultGuildId, activeGuildId } = useGalleryContext();

  const updateGuild = (selectedGuild: string) => {
    setGuild(selectedGuild);
  };

  const updateGallery = (selectedGallery: string) => {
    setGallery(selectedGallery);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (defaultGuildId) {
      setGuild(defaultGuildId);
      // Immediately update context when default guild loads
      setActiveGuild(defaultGuildId);
    }
  }, [defaultGuildId, setActiveGuild]);

  // Update GalleryContext when guild changes (for manual guild selection)
  useEffect(() => {
    if (guild) {
      setActiveGuild(guild);
    }
  }, [guild, setActiveGuild]);

  useEffect(() => {
    if (gallery) {
      setActiveGallery(gallery);
    }
  }, [gallery, setActiveGallery]);

  if (!authReady) return <Loader />;

  return (
    <Flex id="dashboard-page" direction="column" w="full" h="full">
      <Flex id="dashboard-header" direction="row" justify="space-between" align="center">
        <Heading size="2xl">
          Welcome{currentUser?.username ? ` ${currentUser.username}` : ""}!
        </Heading>
        <Flex gap="4">
          {currentUser?.isAdmin && (
            <Button
              onClick={() => {
                goto("/admin");
              }}
            >
              Admin Dashboard
            </Button>
          )}
          <Button
            variant="outline"
            colorPalette="red"
            onClick={() => {
              void logout();
            }}
          >
            Logout
          </Button>
        </Flex>
      </Flex>
      <Flex id="dashboard-content" direction="column" gap="4" mt="8" h="full" w="full">
        <Flex gap="4" mb="4">
          <GuildSelect value={guild} onChange={updateGuild} />
          <Box w="fit" alignSelf="last baseline" mb="0.5rem">
            <SetDefaultGuildButton
              defaultGuild={guild}
              disabled={defaultGuildId === activeGuildId}
            />
          </Box>
        </Flex>
        {galleriesLoading ? (
          <Flex w="full" h="full" justify="center" align="center">
            <Loader />
          </Flex>
        ) : galleriesError ? (
          <Flex w="full" h="full" justify="center" align="center">
            <Text>Error loading galleries.</Text>
          </Flex>
        ) : !galleries || galleries.length === 0 ? (
          <Flex w="full" h="full" justify="center" align="center">
            <Text>No galleries found for the selected guild.</Text>
          </Flex>
        ) : (
          <>
            <GallerySelect guild={guild} value={gallery} onChange={updateGallery} />
            <Gallery guildId={guild} galleryName={gallery} />
          </>
        )}
      </Flex>
      <Box position="fixed" bottom="1rem" right="3rem">
        <Tooltip content="Scroll to top">
          <IconButton rounded="full" onClick={scrollToTop}>
            <HiArrowUp />
          </IconButton>
        </Tooltip>
      </Box>
    </Flex>
  );
};

export default Dashboard;
