from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(
            package='wake_sequence',
            executable='wake_node',
            name='wake_node',
            output='screen',
            parameters=[{
                'use_sim_time': False,
                'action_name': '/unit_zero/wake_sequenc',
            }],
        ),
    ])
