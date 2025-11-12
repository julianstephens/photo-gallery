import { Loader } from "@/components/Loader";
import { useEffect, useState } from "react";
import { useGalleryData } from "../hooks";

const GalleryPage = () => {
  const [errored, setErrored] = useState(false);
  const { data, isLoading, error } = useGalleryData();

  useEffect(() => {
    if (error) {
      setErrored(true);
    }
  }, [error]);

  return (
    <>
      {errored ? (
        <div>Error: {error?.message ?? "Unknown error"}</div>
      ) : isLoading ? (
        <Loader text="Loading gallery..." full={true} />
      ) : (
        <div>Gallery Page: {data?.length ?? 0} items</div>
      )}
    </>
  );
};

export default GalleryPage;
