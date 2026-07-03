from setuptools import setup

package_name = 'wake_sequence'

setup(
    name=package_name,
    version='1.0.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/launch', ['launch/wake.launch.py']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='IEEE RAS NODE ZERO',
    maintainer_email='nodezero@ieeeras.example',
    description="NODE ZERO Stage 6: Unit Zero's wake sequence action server.",
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'wake_node = wake_sequence.wake_node:main',
        ],
    },
)
