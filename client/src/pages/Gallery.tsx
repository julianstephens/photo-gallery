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
        <div>Loading...</div>
      ) : (
        <div>Gallery Page: {data.length} items</div>
      )}
    </>
  );
};

export default GalleryPage;
