import { GallerySelect, GuildSelect } from "@/components/forms/Fields";
import { Gallery } from "@/components/Gallery";
import { Loader } from "@/components/Loader";
import { SetDefaultGuildButton } from "@/components/SetDefaultGuild";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuth, useDefaultGuild } from "@/hooks";
import { Box, Button, Flex, Heading, IconButton } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { HiArrowUp } from "react-icons/hi";
import { useNavigate } from "react-router";

const Dashboard = () => {
  const [guild, setGuild] = useState<string>("");
  const [gallery, setGallery] = useState<string>("");
  const { currentUser, authReady, logout } = useAuth();
  const goto = useNavigate();
  const defaultGuild = useDefaultGuild();

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
    if (defaultGuild) {
      setGuild(defaultGuild);
    }
  }, [defaultGuild]);

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
            <SetDefaultGuildButton defaultGuild={guild} />
          </Box>
        </Flex>
        <GallerySelect
          guild={guild}
          setGuild={updateGuild}
          value={gallery}
          onChange={updateGallery}
        />
        <Gallery guildId={guild} galleryName={gallery} />
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
