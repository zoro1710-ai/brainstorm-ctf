# NODE ZERO — Stage 8: Full Boot (Finale)

Everything you've recovered comes together here. Unit Zero's body, for this
last stretch, is a turtlesim turtle. Bring it home.

## Setup

1. Clone this repo.
2. Copy both packages into your workspace:
   ```
   cp -r full_boot_interfaces full_boot ~/ros2_ws/src/
   ```
3. Build:
   ```
   cd ~/ros2_ws
   colcon build --packages-select full_boot_interfaces full_boot
   source install/setup.bash
   ```
4. Launch:
   ```
   ros2 launch full_boot boot.launch.py
   ```

This one has **several faults at once**. Don't try to fix everything blind —
bring it up once, read what actually happens, and work through them one at
a time.

## What to do next

Once everything is healthy, a turtlesim window comes up alongside Unit
Zero's supervisor. Watch `/unit_zero/status` — it tells you plainly what's
still missing before a wake attempt can succeed.

Piloting the turtle is standard ROS 2 teleop: publish `geometry_msgs/Twist`
messages to `/turtle1/cmd_vel` (by hand with `ros2 topic pub`, with
`ros2 run turtlesim turtle_teleop_key`, or however you like) to get it into
the recovery zone.

The final wake is a service call with the key you carried from Stage 7.

## When you're done

Get it right and Unit Zero fully wakes, handing you the last flag. First
team to submit it wins the kit.
