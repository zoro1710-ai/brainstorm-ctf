from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(
            package='turtlesim',
            executable='turtlesim_node',
            name='turtlesim',
            output='screen',
        ),
        Node(
            package='full_boot',
            executable='beacon_node',
            name='beacon_node',
            output='screen',
            parameters=[{
                'durability': 'volatile',
            }],
        ),
        Node(
            package='full_boot',
            executable='supervisor_node',
            name='supervisor_node',
            output='screen',
            parameters=[{
                'target_radius': 0.05,
            }],
            remappings=[
                ('turtle_pose', '/turtle1/pose_bad'),
            ],
        ),
    ])
