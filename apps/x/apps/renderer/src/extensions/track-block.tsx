export type OpenTrackModalDetail = {
    trackId: string;
    filePath: string;
    initialYaml: string;
    onDeleted: () => void;
};

export const TrackBlockExtension = {
    name: "trackBlock",
};
