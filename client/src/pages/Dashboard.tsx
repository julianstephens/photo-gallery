import { Loader } from "@/components/Loader";
import { useAuth, useGalleryData } from "@/hooks";
import { Box, Button, Flex, Heading } from "@chakra-ui/react";
import { useNavigate } from "react-router";

const Dashboard = () => {
  const { currentUser, authReady, logout } = useAuth();
  const { data, isLoading, error } = useGalleryData();
  const goto = useNavigate();

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
        {isLoading && <Loader />}
        {error && <div>Error loading gallery data</div>}
        {data && (
          <Box alignSelf="center" my="auto">
            Gallery has {data.length} items.
          </Box>
        )}
      </Flex>
    </Flex>
  );
};

export default Dashboard;
