# NODE ZERO — Stage 6: Wake Sequence

Unit Zero's wake sequence action server is here. Bring it up and speak to it.

## Setup

1. Clone this repo.
2. Copy both packages into your workspace:
   ```
   cp -r wake_sequence_interfaces wake_sequence ~/ros2_ws/src/
   ```
3. Build them:
   ```
   cd ~/ros2_ws
   colcon build --packages-select wake_sequence_interfaces wake_sequence
   source install/setup.bash
   ```
4. Launch it:
   ```
   ros2 launch wake_sequence wake.launch.py
   ```

## What to do next

In a second terminal (source the workspace again), find out what the action
server actually registered as — don't assume it matches what you'd expect.
If it doesn't, the fix is in `wake_sequence/launch/wake.launch.py`. Edit,
rebuild, relaunch.

Once it's listening where it should be, this is a **single command** — send
the goal with the code you're carrying forward, and read the result.

## When you're done

The result carries the flag and names Unit Zero's next artifact.
