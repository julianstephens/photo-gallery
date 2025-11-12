import { Loader } from "@/components/Loader";
import { useAuth } from "@/hooks";
import { Button, Flex, Heading } from "@chakra-ui/react";
import { Navigate } from "react-router";

const LandingPage = () => {
  const { login, isAuthed, authReady, loading } = useAuth();

  if (!authReady) return <Loader />;

  if (isAuthed) return <Navigate to="/home" replace />;

  return (
    <Flex direction="column" align="center" justify="center" height="full" gap="10">
      <Flex direction="column" align="center" gap="4">
        <Heading size="lg">Welcome to the Photo Gallery 5000</Heading>
      </Flex>
      <Button
        variant="solid"
        colorPalette="blue"
        loading={loading}
        disabled={loading}
        onClick={() => {
          void login();
        }}
      >
        Login
      </Button>
    </Flex>
  );
};

export default LandingPage;
