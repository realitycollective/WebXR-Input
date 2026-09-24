import { NO_CAPABILITIES, type InputCapabilities } from "./capabilities.js";
import type { InputProvider } from "./provider.js";
import type {
  Handedness,
  InputSourceSnapshot,
  PresenceModality,
} from "./source.js";
import type { HeadPose, Unsubscribe } from "./types.js";

/**
 * An in-memory {@link InputProvider}: the family's mock, for headless tests
 * and for checking a new adapter against the same reference. It needs no
 * engine, no WebXR and no headset, and it passes every case in
 * `inputProviderContractCases()`.
 *
 * It reports two tracked hands, left and right, with fixed poses, and
 * declares every capability it can serve. {@link enterSession} and
 * {@link exitSession} are the driver hooks the contract suite uses: each
 * re-publishes the current capabilities, the way a live provider does when
 * a session starts or ends.
 *
 * ```ts
 * for (const contractCase of inputProviderContractCases()) {
 *   const provider = new MemoryInputProvider();
 *   contractCase.run(provider, {
 *     enterSession: () => provider.enterSession(),
 *     exitSession: () => provider.exitSession(),
 *   });
 * }
 * ```
 */
export class MemoryInputProvider implements InputProvider {
  private capabilities: InputCapabilities = {
    ...NO_CAPABILITIES,
    rays: true,
    pokes: true,
    grabs: "poseOnly",
    handJoints: true,
    pinch: true,
    buttonsAxes: true,
    headPose: true,
    haptics: true,
    presence: true,
  };
  private readonly capabilityListeners = new Set<(capabilities: InputCapabilities) => void>();
  private readonly sourceListeners = new Set<() => void>();
  private readonly visible: Record<"left" | "right", boolean> = { left: true, right: true };
  private modality: PresenceModality = "auto";

  public getCapabilities(): InputCapabilities {
    return { ...this.capabilities };
  }

  public onCapabilitiesChanged(listener: (capabilities: InputCapabilities) => void): Unsubscribe {
    this.capabilityListeners.add(listener);
    return () => {
      this.capabilityListeners.delete(listener);
    };
  }

  public onSourcesChanged(listener: () => void): Unsubscribe {
    this.sourceListeners.add(listener);
    return () => {
      this.sourceListeners.delete(listener);
    };
  }

  /**
   * Fresh objects on every call. The ownership rule on
   * {@link InputSourceSnapshot} says a snapshot handed over is never
   * written to again.
   */
  public sample(): readonly InputSourceSnapshot[] {
    return [
      {
        id: "left-hand",
        kind: "hand",
        handedness: "left",
        select: 0,
        squeeze: 0,
        ray: { origin: [0, 1.4, 0], direction: [0, 0, -1] },
        indexTip: [0.1, 1.3, -0.3],
      },
      {
        id: "right-hand",
        kind: "hand",
        handedness: "right",
        select: 0.2,
        squeeze: 0,
        ray: { origin: [0, 1.4, 0], direction: [0, 0, -1] },
        indexTip: [-0.1, 1.3, -0.3],
      },
    ];
  }

  public getHeadPose(): HeadPose {
    return { position: [0, 1.6, 0], quaternion: [0, 0, 0, 1] };
  }

  /** Accepts every pulse. */
  public pulse(_sourceId: string, _intensity: number, _durationMs: number): boolean {
    return true;
  }

  public setPresenceVisible(target: Handedness | "all", visible: boolean): boolean {
    if (target === "all") {
      this.visible.left = visible;
      this.visible.right = visible;
    } else if (target !== "none") {
      this.visible[target] = visible;
    }
    return true;
  }

  public setPresenceModality(mode: PresenceModality): boolean {
    this.modality = mode;
    return true;
  }

  /** Whether one side's visuals are shown, as the last presence call left them. */
  public isPresenceVisible(side: "left" | "right"): boolean {
    return this.visible[side];
  }

  /** The modality the last presence call chose. */
  public getPresenceModality(): PresenceModality {
    return this.modality;
  }

  /** Driver hook: a session starts, and capabilities are re-published. */
  public enterSession(): void {
    this.publish();
  }

  /** Driver hook: the session ends, and capabilities are re-published. */
  public exitSession(): void {
    this.publish();
  }

  private publish(): void {
    for (const listener of [...this.capabilityListeners]) {
      listener(this.getCapabilities());
    }
  }
}
