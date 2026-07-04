# NODE ZERO — Stage 5: Mission 047

The corrupted log named a recording: `mission_047`. Unit Zero logged its last
real mission to a rosbag before everything went quiet.

## Setup

1. Clone this repo.
2. Inspect the bag (no workspace/build needed — just the ROS 2 CLI):
   ```
   ros2 bag info node_zero_mission047/mission_047
   ```
3. Replay it:
   ```
   ros2 bag play node_zero_mission047/mission_047
   ```

## What to do next

`ros2 bag info` lists every topic in the bag. Most of them are ordinary
telemetry. Look for the one that isn't, then read it — in a second terminal,
before (or while) you replay the bag, so you don't miss the start:

```
ros2 topic echo <the-topic-you-found> > capture.log
```

The messages don't arrive in a tidy order. Each one carries a little more
than just its payload — enough to put them back in order yourself. If you
miss messages on a live replay, just replay the bag again; it doesn't
change between runs. `rosbag2_py`'s `SequentialReader` also works if you'd
rather read the bag directly instead of replaying it live.

Not everything on that channel is genuine, either. Don't trust every
message you capture at face value — work out what a real one looks like
before you start reassembling.

## When you're done

Reassembling the channel gives you the flag **and** a handoff to the next
artifact. Read it carefully — it also tells you what code you'll need there.
