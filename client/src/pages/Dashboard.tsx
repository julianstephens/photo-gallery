import { GallerySelect, GuildSelect } from "@/components/forms/Fields";
import { Gallery } from "@/components/Gallery";
import { Loader } from "@/components/Loader";
import { useAuth, useDefaultGuild } from "@/hooks";
import { Button, Flex, Heading } from "@chakra-ui/react";
import { useEffect, useState } from "react";
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
        <GuildSelect value={guild} onChange={updateGuild} />
        <GallerySelect
          guild={guild}
          setGuild={updateGuild}
          value={gallery}
          onChange={updateGallery}
        />
        <Gallery galleryName={gallery} />
      </Flex>
    </Flex>
  );
};

export default Dashboard;
