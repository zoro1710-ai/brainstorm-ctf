cmake_minimum_required(VERSION 3.8)
project(wake_sequence_interfaces)

find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)

rosidl_generate_interfaces(${PROJECT_NAME}
  "action/WakeSequence.action"
)

ament_package()
