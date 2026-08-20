/** Position as [x, y, z] in meters, world space unless stated otherwise. */
export type Vec3Tuple = [number, number, number];

/** Orientation quaternion as [x, y, z, w]. */
export type QuatTuple = [number, number, number, number];

/** A world-space pose. */
export interface PoseTuple {
  position: Vec3Tuple;
  quaternion: QuatTuple;
}

/** Returned by every subscription; call to detach the listener. */
export type Unsubscribe = () => void;

/** A ray in world space; `direction` is expected normalised. */
export interface RayTuple {
  origin: Vec3Tuple;
  direction: Vec3Tuple;
}

/** A viewer (head) pose sample - camera on desktop, HMD in XR. */
export interface HeadPose {
  position: Vec3Tuple;
  quaternion: QuatTuple;
}

/** Supplies the viewer pose each frame. */
export interface HeadPoseSource {
  getHeadPose(): HeadPose;
}
