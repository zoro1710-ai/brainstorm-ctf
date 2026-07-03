from setuptools import setup

package_name = 'full_boot'

setup(
    name=package_name,
    version='1.0.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/launch', ['launch/boot.launch.py']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='IEEE RAS NODE ZERO',
    maintainer_email='nodezero@ieeeras.example',
    description='NODE ZERO Stage 8 (finale): full wake supervisor.',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'supervisor_node = full_boot.supervisor_node:main',
            'beacon_node = full_boot.beacon_node:main',
        ],
    },
)
